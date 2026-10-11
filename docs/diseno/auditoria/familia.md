# Auditoría D18: familias, alumnos y expediente (prefijo `familia-`)

## Resumen

- Filas revisadas: **101** (101 ids x 2 vistas = 202 capturas de después abiertas en hoja de contacto; individuales abiertas y medidas donde hacía falta). Las 101 filas tienen ✔ en antes y después en `INVENTARIO.md` y existen los 202 archivos `despues/familia-*`.
- Hallazgos: **18 filas con hallazgo** (6 hallazgos distintos). Por tipo: tipo 1 = 2 hallazgos (4 capturas), tipo 2 = 0, tipo 3 = 2 (uno consolidado, de decisión), tipo 4 = 2.
- Por gravedad: alta 0, media 2, baja 4. No hay pantalla con aspecto anterior, ni medida táctil por debajo de 44/52, ni más de una acción principal, ni la cifra principal por debajo de otra (saldo 36 px contra título 30; en celular saldo igual o mayor que el título de 34).
- Medido en captura (1 px = 1 px CSS): botones del diálogo en celular 52 (principal y destructivo) y 44 (secundario); Anterior/Siguiente 44; «Ver la familia», «Ocultar», selects y campos 44; «Registrar pago» en celular 52.
- Decisión ya tomada y no reportada: teléfonos en E.164 (invariante 7).

## Hallazgos (ordenados por gravedad)

| id de la fila | vista | tipo (1–4) | qué se ve mal | dónde lo prueba (medida o regla de SISTEMA-VISUAL) | gravedad |
|---|---|---|---|---|---|
| `familia-acciones-cambiar-grupo-lleno` | escritorio y celular | 1 | La captura no muestra el estado del título («grupo de un solo lugar ya lleno, `· lleno`, no se puede elegir»): el cuadro muestra «Elige un grupo» y «Confirmar el cambio» apagado, idéntico al de `familia-acciones-cambiar-vacio`. | Diferencia de píxeles entre `cambiar-grupo-lleno-*.jpg` y `cambiar-vacio-*.jpg` = 0 en las dos vistas (también con hash). Regla del prompt, tipo 1: captura que no muestra el estado de su título. | media |
| `familia-acciones-baja-sin-motivos` | escritorio y celular | 1 | La captura no muestra «sin motivos en el catálogo (lista de motivos vacía)»: sale «Elige un motivo» y «Dar de baja» apagado, idéntico a `familia-acciones-baja-vacio`. | Diferencia de píxeles entre `baja-sin-motivos-*.jpg` y `baja-vacio-*.jpg` = 0 en las dos vistas. Tipo 1. | media |
| `familia-alumnos-lista-paginacion`, `familia-familias-lista-paginacion`, `familia-un-solo-hijo-paginacion`, `familia-alumnos-lista-busqueda-incompleta`, `familia-familias-lista-busqueda-incompleta` | celular | 4 | El paginador se parte en dos filas: «Anterior» y «Página N de M · T en total» arriba, y «Siguiente» solo, alineado a la izquierda debajo. La acción de avanzar queda fuera de lugar frente a escritorio (Anterior a la izquierda, Siguiente a la derecha, contador en medio). | Parte baja de `*-celular.jpg` (p. ej. alumnos-lista-paginacion, y 2459 de alto): «Siguiente» en una segunda fila a x=16. Regla 4 (elementos mal colocados) y coherencia con el patrón de escritorio. | baja |
| `familia-expediente-trayectoria-administrador`, `familia-salud-motivo`, `familia-salud-motivo-escrito`, `familia-salud-ficha`, `familia-salud-sin-ficha`, `familia-salud-ficha-parcial`, `familia-salud-error-servidor`, `familia-salud-cargando`, `familia-salud-error` | escritorio | 4 | En la barra lateral del administrador, el último enlace «Administración» queda casi ilegible (texto gris oscuro sobre `--lateral`) y cortado sobre la línea del usuario. Es el desvanecido a propósito de `.lateral-con-mas` (máscara de 36 px), pero en el viewport de 768 px se pierde un destino de navegación. | Recorte a 4x de `familia-salud-ficha-escritorio.jpg` (0-232 x 600-768): «Administración» con contraste muy por debajo de 4.5:1. Regla 3 (contraste AA) y 4 (cortado). No se reporta la barra «a media imagen» de capturas de página completa: esto es captura de 768 px de alto. | baja |
| `familia-ficha-no-encontrada`, `familia-expediente-no-encontrado` | escritorio y celular | 3 | El botón «Ir a mi inicio» dentro del aviso de error lleva texto rojo con borde gris de secundario: no es el destructivo del sistema (borde y texto `--peligro`) ni el secundario (texto `--texto`), y la acción no destruye nada. Mismo aviso con «Reintentar» (`familia-ficha-error`, `familia-expediente-error`) usa texto oscuro. | `familia-ficha-no-encontrada-celular.jpg` (botón 44 de alto, y 263-306): texto rojo oscuro, borde #CDC8CC. Componentes > Botones: solo hay primario, secundario, sutil, destructivo, deshabilitado. | baja |
| varias (avatares `HR`, `RR`, `HG`... en `familia-ficha-*`, `familia-alumnos-lista-*`, `familia-familias-lista-*`, `familia-un-solo-hijo-*`, encabezado de `familia-expediente-*`) | escritorio y celular | 3 | El avatar de iniciales tiene fondo #ECEBFC (`--primario-suave`) y la referencia `Recepcion.dc.html` (encabezado de familia) usa #DAD8FA. Se ve más claro que la referencia. Es una discrepancia entre la tabla y la referencia, no un error de implementación: #DAD8FA no está en la tabla de color. | Pixel del avatar en `familia-ficha-recepcion-escritorio.jpg` (268,90) = #ECEBFB; `Recepcion.dc.html` línea 70 `background: #DAD8FA`. Regla 5 (solo variables). Decisión para Eduardo: o se agrega el valor a la tabla o se deja. | baja |

## Notas (no cuentan como hallazgo)

- `familia-alumnos-lista-cargando`, `familia-expediente-cargando`, `familia-familias-lista-cargando` y `familia-ficha-cargando` son pantallas distintas con capturas iguales (solo «Cargando…» dentro del marco, sin título): muestran el estado, pero no se distingue la pantalla. Escritorio: alumnos ≡ expediente y familias ≡ ficha; celular: las cuatro iguales.
- El botón «Buscar» aparece más oscuro (`--primario-fuerte`) en las capturas tomadas justo después de pulsarlo: es el estado hover/foco, no un color fuera del sistema.
- Las píldoras neutras y «Congelada» sobre la fila gris de «Inscripciones» casi no se separan del fondo (la píldora no destaca), pero el texto lleva contraste suficiente y el estado va en texto.

## Ids sin hallazgos (83)

- `familia-alumnos-lista`
- `familia-alumnos-lista-buscar-nombre`
- `familia-alumnos-lista-buscar-telefono`
- `familia-alumnos-lista-sin-resultados`
- `familia-alumnos-lista-filtro-congelados`
- `familia-alumnos-lista-filtro-bajas`
- `familia-alumnos-lista-vacio`
- `familia-alumnos-lista-muchos`
- `familia-alumnos-lista-cargando`
- `familia-alumnos-lista-error`
- `familia-alumnos-lista-sin-conexion`
- `familia-expediente-trayectoria-recepcion`
- `familia-expediente-trayectoria-asesor`
- `familia-expediente-economico`
- `familia-expediente-operativo`
- `familia-expediente-comercial`
- `familia-expediente-trayectoria-completa`
- `familia-expediente-economico-completo`
- `familia-expediente-economico-sin-cuenta`
- `familia-expediente-operativo-completo`
- `familia-expediente-operativo-sin-datos`
- `familia-expediente-comercial-completo`
- `familia-expediente-inscripcion-congelada`
- `familia-expediente-inscripcion-baja`
- `familia-expediente-trayectoria-vacio`
- `familia-expediente-trayectoria-muchos`
- `familia-expediente-economico-vacio`
- `familia-expediente-economico-muchos`
- `familia-expediente-operativo-vacio`
- `familia-expediente-operativo-muchos`
- `familia-expediente-comercial-vacio`
- `familia-expediente-comercial-muchos`
- `familia-expediente-cargando`
- `familia-expediente-error`
- `familia-acciones-cambiar-vacio`
- `familia-acciones-cambiar-elegido`
- `familia-acciones-cambiar-sin-grupos`
- `familia-acciones-cambiar-cargando`
- `familia-acciones-cambiar-error-carga`
- `familia-acciones-cambiar-error-servidor`
- `familia-acciones-cambiar-sin-conexion`
- `familia-acciones-congelar`
- `familia-acciones-congelar-error-servidor`
- `familia-acciones-reactivar`
- `familia-acciones-reactivar-error-servidor`
- `familia-acciones-baja-vacio`
- `familia-acciones-baja-con-motivo`
- `familia-acciones-baja-cargando`
- `familia-acciones-baja-error-carga`
- `familia-acciones-baja-error-servidor`
- `familia-acciones-baja-sin-conexion`
- `familia-familias-lista`
- `familia-familias-lista-buscar-telefono`
- `familia-familias-lista-buscar-nombre`
- `familia-familias-lista-sin-resultados`
- `familia-familias-lista-vacio`
- `familia-familias-lista-muchos`
- `familia-familias-lista-cargando`
- `familia-familias-lista-error`
- `familia-familias-lista-sin-conexion`
- `familia-un-solo-hijo`
- `familia-un-solo-hijo-muchos`
- `familia-un-solo-hijo-vacio`
- `familia-un-solo-hijo-cargando`
- `familia-un-solo-hijo-error`
- `familia-un-solo-hijo-otra-sucursal`
- `familia-ficha-recepcion`
- `familia-ficha-asesor`
- `familia-ficha-hijos-variados`
- `familia-ficha-sin-hijos`
- `familia-ficha-muchos`
- `familia-ficha-saldo-cargando`
- `familia-ficha-saldo-error`
- `familia-ficha-cargando`
- `familia-ficha-error`
- `familia-acciones-congelar-hecho`
- `familia-acciones-reactivar-real`
- `familia-acciones-reactivar-hecho`
- `familia-acciones-cambiar-hecho`
- `familia-acciones-baja-hecho`
- `familia-expediente-comercial-con-baja`
- `familia-ficha-hijos-en-baja`
- `familia-alumnos-lista-bajas-reales`
