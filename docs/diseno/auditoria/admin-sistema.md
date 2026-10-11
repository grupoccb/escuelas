# Auditoría D18 — Administración, sistema y mensajería (prefijo `admins-`)

## Resumen

- Filas revisadas: 180 de 180 (360 capturas de después: 180 en escritorio y 180 en celular). El encargo decía ~181; el inventario trae 180. Todas tienen ✔ en antes y ✔ en después en `INVENTARIO.md`, y los 360 archivos existen.
- Revisé las 66 hojas de contacto (30 de escritorio, 36 de celular) y abrí a tamaño completo las capturas dudosas.
- Hallazgos: 6 entradas en la tabla, que cubren 18 ids. Tipo 1: 0. Tipo 2: 3 (peligro con relleno suave en un diálogo; acciones repetidas con texto en campañas y bandeja). Tipo 3: 0. Tipo 4: 3.
- Por gravedad: alta 0, media 1, baja 5.
- Ninguna pantalla conserva el aspecto anterior. Todas usan Figtree/Bricolage, azul `#3A32D1`, tarjetas con borde, avisos sin franja gruesa y botones de peligro en blanco con borde rojo (salvo el caso 2 de abajo). Los diálogos de celular cumplen 52 px en Guardar y 44 px en lo demás; los íconos de solo acción miden 44 px.
- No reporté el efecto del arnés (barra lateral cortada arriba, barra de «Guardar la configuración» a media página, hover y foco que quedan puestos), los `<select>` nativos ni «Modo de cierre», «Qué hace el bot» y «Clase».

## Hallazgos (ordenados por gravedad)

| id de la fila | vista | tipo (1–4) | qué se ve mal | dónde lo prueba (medida o regla de SISTEMA-VISUAL) | gravedad |
|---|---|---|---|---|---|
| `admins-textos-modulos-apagados` | celular | 4 | En la barra inferior, la etiqueta «Registrar pago» se parte en dos líneas («Registrar / pago»). El ícono de esa pestaña queda unos 8 px más arriba que los de «Pase de lista», «Embudo», «Tareas» y «Más». La fila de pestañas queda desalineada. Se ve con los módulos apagados, cuando la barra pasa a 5 pestañas con ese nombre largo. | Navegación, celular: «ícono de 24 px y texto de 12.5». Regla 4 de «Qué es un hallazgo»: elementos montados o desalineados. Capturado en `docs/diseno/capturas/despues/admins-textos-modulos-apagados-celular.jpg`. | media |
| `admins-canales-con-datos`, `admins-canales-muchos`, `admins-canales-aviso-bandeja-quitada`, `admins-canales-aviso-canal-guardado` | celular | 4 | En la tarjeta del canal, el ícono de la bandeja (globo de chat) queda solo en una línea y el texto «Bandeja: Vertical Prueba (cuenta …, bandeja …)» empieza debajo, a unos 26 px. El ícono parece huérfano. En `admins-canales-con-y-sin-bandeja`, donde el texto es corto, ícono y texto van en la misma línea. | Tarjeta de lista: «datos secundarios debajo» del nombre. El ícono y su texto deben leerse como una sola línea. Capturado en `admins-canales-con-datos-celular.jpg` (ícono en y≈530, texto en y≈640). | baja |
| `admins-canales-quitar-bandeja-confirmar` | celular | 2 | El botón «Quitar» del diálogo aparece con relleno rosa suave (≈ `#FDECEA`) y borde rojo. Es el aspecto anterior del peligro. En `admins-canales-quitar-bandeja-error-servidor`, `admins-canales-baja-confirmar` y los demás diálogos de confirmación, el mismo tipo de botón es blanco con borde rojo. Parece el estado hover o foco que quedó puesto al abrir el diálogo. Si ese relleno suave en hover es intencional, descartar. | Botones, destructivo: «fondo blanco, borde y texto `--peligro`». Capturado en `admins-canales-quitar-bandeja-confirmar-celular.jpg`. | baja |
| `admins-configuracion-guardada` | celular | 4 | En el aviso «Configuración guardada.» sobre el botón, el ícono de palomita queda aplastado a unos 6 px y en gris, no verde. El texto se parte en dos líneas. La señal de éxito pierde el ícono. Sigue el texto, así que no es color como única señal. En escritorio la palomita sí se ve completa. | Íconos: trazo de 1.6, tamaño de 20 a 24 px. `--exito` `#17603A` para correcto. Capturado en `admins-configuracion-guardada-celular.jpg`. | baja |
| `admins-campanas-con-datos`, `admins-campanas-muchos`, `admins-campanas-con-inactiva`, `admins-campanas-aviso-guardada` | escritorio y celular | 2 | Cada tarjeta de campaña lleva un botón grande con texto, «Código QR» (sutil, relleno `--primario-suave`, unos 130 × 44 px), repetido en todas las filas, además de los íconos de editar y dar de baja. | Tarjeta de lista: «las acciones repetidas en cada tarjeta son botones de solo ícono, no botones grandes». Capturado en `admins-campanas-con-inactiva-escritorio.jpg` (7 filas, 7 botones iguales). | baja |
| `admins-bandeja-con-datos`, `admins-bandeja-muchos`, `admins-bandeja-eventos-variados`, `admins-bandeja-detalle-abierto`, `admins-bandeja-resolver-error-servidor`, `admins-bandeja-resolver-sin-conexion`, `admins-bandeja-error-solo-tareas` | escritorio y celular | 2 | Cada tarea y cada evento repiten un botón sutil con texto grande («Marcar hecha» o «Marcar atendido», unos 124 × 44 px) más la X para descartar. En celular ocupa media fila de cada tarjeta. | Tarjeta de lista: acciones repetidas como botones de solo ícono. Capturado en `admins-bandeja-con-datos-escritorio.jpg` y `admins-bandeja-muchos-celular.jpg`. El texto aclara la acción; decide Eduardo si aquí vale la excepción. | baja |

## Ids sin hallazgos (162 de 180)

Todas las vistas de escritorio y celular de estos ids se ven correctas.

**automatizaciones** (todos los ids de la pantalla):
`admins-automatizaciones-ajustar-error-servidor`, `-ajustar-pago-atrasado`, `-ajustar-recordatorio`, `-ajustar-validacion`, `-ajustar-validacion-atraso`, `-alternar-error-servidor`, `-alternar-sin-conexion`, `-aviso-apagada`, `-aviso-encendida`, `-aviso-guardada`, `-cargando`, `-con-datos`, `-en-pausa`, `-error`, `-muchos`, `-vacio`, `-variadas`.

**bandeja** (los que no están en la tabla):
`admins-bandeja-aviso-descartada`, `-aviso-hecha`, `-cargando`, `-error`, `-solo-eventos-vacio`, `-vacio`.

**campañas** (los que no están en la tabla):
`admins-campanas-baja-confirmar`, `-baja-error-servidor`, `-cargando`, `-editar`, `-error`, `-nueva-error-servidor`, `-nueva-vacio`, `-nueva-validacion`, `-qr`, `-qr-sin-sucursales`, `-vacio`.

**canales** (los que no están en la tabla):
`admins-canales-baja-confirmar`, `-baja-error-servidor`, `-bandeja-agregar`, `-bandeja-editar`, `-bandeja-error-servidor`, `-bandeja-validacion`, `-cargando`, `-con-y-sin-bandeja`, `-editar`, `-error`, `-nuevo-error-servidor`, `-nuevo-vacio`, `-nuevo-validacion`, `-quitar-bandeja-error-servidor`, `-vacio`.

**configuración** (los que no están en la tabla):
`admins-configuracion-cargando`, `-con-datos`, `-error`, `-error-servidor`, `-modulos-apagados`, `-sin-conexion`, `-validacion`.

**etapas** (todos): `admins-etapas-agregar-error-servidor`, `-agregar-vacio`, `-agregar-validacion`, `-cambiar`, `-cambiar-cierre`, `-cambiar-validacion`, `-cargando`, `-con-datos`, `-con-propia`, `-error`, `-mover-error-servidor`, `-muchos`, `-quitar-confirmar`, `-quitar-error-servidor`, `-vacio`.

**módulos** (todos): `admins-modulos-algunos-apagados`, `-apagar-confirmar`, `-apagar-error-servidor`, `-aviso-apagado`, `-aviso-encendido`, `-cargando`, `-con-datos`, `-encender-error-servidor`, `-encender-sin-conexion`, `-error`, `-solo-captacion`, `-todos-encendidos`.

**motivos** (todos): `admins-motivos-agregar-baja`, `-agregar-error-servidor`, `-agregar-vacio`, `-agregar-validacion`, `-cambiar`, `-cambiar-validacion`, `-cargando`, `-con-apagado`, `-con-datos`, `-error`, `-modulos-apagados`, `-muchos`, `-quitar-confirmar`, `-quitar-error-servidor`, `-vacio`.

**plantillas** (todos): `admins-plantillas-aviso-guardada-sin-aprobar`, `-baja-confirmar`, `-baja-en-uso`, `-cargando`, `-con-datos`, `-editar-marketing`, `-editar-servicio`, `-error`, `-estados-variados`, `-filtro-servicio`, `-filtro-sin-resultados`, `-muchos`, `-nueva-error-servidor`, `-nueva-servicio-marketing`, `-nueva-vacio`, `-nueva-validacion`, `-nueva-variables`, `-vacio`.

**textos** (los que no están en la tabla): `admins-textos-cambiar`, `-cambiar-error-servidor`, `-cambiar-personalizado`, `-cambiar-sin-huecos`, `-cambiar-validacion-hueco`, `-cambiar-validacion-obligatorio`, `-cambiar-validacion-vacio`, `-cambiar-vista-previa`, `-cargando`, `-con-datos`, `-error`, `-personalizados`, `-vacio`.

**usuarios** (todos): `admins-usuarios-activar-error-servidor`, `-aviso-activado`, `-aviso-contrasena`, `-aviso-creado`, `-aviso-desactivado`, `-aviso-guardado`, `-busqueda`, `-busqueda-sin-resultados`, `-cargando`, `-chatwoot-error-servidor`, `-chatwoot-ligado`, `-chatwoot-vacio`, `-chatwoot-validacion`, `-con-datos`, `-con-inactivo-y-agente`, `-desactivar-confirmar`, `-desactivar-error-servidor`, `-editar`, `-editar-error-servidor`, `-editar-validacion`, `-editar-yo`, `-error`, `-muchos`, `-nuevo-administrador`, `-nuevo-error-servidor`, `-nuevo-sin-conexion`, `-nuevo-vacio`, `-nuevo-validacion`, `-nuevo-validacion-contrasena`, `-restablecer-error-servidor`, `-restablecer-validacion`, `-restablecer-vacio`, `-vacio`.

Los 18 ids con hallazgo son los de la tabla y quedan fuera de las listas de arriba:
`admins-textos-modulos-apagados`, `admins-canales-con-datos`, `admins-canales-muchos`, `admins-canales-aviso-bandeja-quitada`, `admins-canales-aviso-canal-guardado`, `admins-canales-quitar-bandeja-confirmar`, `admins-configuracion-guardada`, `admins-campanas-con-datos`, `admins-campanas-muchos`, `admins-campanas-con-inactiva`, `admins-campanas-aviso-guardada`, `admins-bandeja-con-datos`, `admins-bandeja-muchos`, `admins-bandeja-eventos-variados`, `admins-bandeja-detalle-abierto`, `admins-bandeja-resolver-error-servidor`, `admins-bandeja-resolver-sin-conexion`, `admins-bandeja-error-solo-tareas`.

## Comprobaciones hechas

- `INVENTARIO.md`: 180 filas con prefijo `admins-`; ninguna con ✘ en antes ni en después.
- Existen 360 archivos `admins-*` en `capturas/antes/` y 360 en `capturas/despues/`.
- Todas las capturas de después muestran el estado de su título: errores, validaciones, avisos, diálogos y cargando.
- Medidas contra la referencia, en capturas abiertas: Guardar en diálogos de celular ≈ 52 px; botones de confirmar ≈ 44 px; íconos de solo acción y casillas ≈ 44 px; interruptores de módulos con caja de toque de 44 px (`base.css`, `.interruptor`); campos de 44 px con borde `--borde-campo`; error con borde de 2 px rojo y mensaje debajo.
