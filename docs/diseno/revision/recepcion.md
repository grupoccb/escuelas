# Revisión de diseño: Recepción

Revisadas las 97 escenas `recep-*` en escritorio (1366) y celular (390), con capturas regeneradas el 10 de octubre de 2026 (195 pruebas pasaron, incluidas `metodo-tarjeta` y `metodo-transferencia`).

## Resumen

1. El rediseño está aplicado de forma consistente en el área: Bricolage en títulos y cifras, Figtree en el resto, botón primario único, selector segmentado de método de pago, paneles con borde de 16, etiquetas de estado con ícono y texto, y tablas que se apilan en tarjetas en celular. Ninguna pantalla conserva el aspecto anterior (comparadas con `antes/`).
2. «Registrar pago» sigue de cerca a `Recepcion.dc.html` (cifra de 36 px en «Lo que adeuda», monto de 56 px, resumen del reparto, botón de 52 px). La regla 2 se cumple en pantalla, pero falla en el recibo impreso y en la confirmación del pago registrado: ahí lo más grande es el saldo y no el pago que se acaba de hacer.
3. El defecto visual más repetido es el anillo de foco doble en los campos con caja propia (monto, búsquedas): se ve un anillo dentro de otro, y con error se mezclan el borde rojo y el anillo violeta.
4. En el cierre del día con devoluciones, tres totales de 36 px compiten con el mismo peso y el «Neto del día», que es lo que se cuadra, no destaca. Hay estados vacíos incompletos (paneles «Existencia» vacíos, avisos en lugar del estado vacío) y acciones repetidas por fila («Cancelar pago», «Anular») como texto rojo sin borde.
5. Las vistas de impresión son blanco y negro, legibles y sin color como única señal. No hay desbordes horizontales ni tablas sin versión de celular. Los diálogos y avisos son iguales al resto del área.

## Hallazgos

| escena | vista | qué no cumple | regla o medida de SISTEMA-VISUAL | gravedad |
|---|---|---|---|---|
| `recep-pagos-recibo-impresion` | escritorio y celular | El recibo se imprime con el título de la pantalla («Registrar pago»). El pago hecho («$100.00 · Efectivo») va en 14 px dentro de un recuadro, y lo más grande de la hoja es el saldo pendiente ($2,850.00 a 36 px). Además arrastra la lista completa de cargos y los pagos recientes. Lo que la familia se lleva en papel es el comprobante del pago, no el adeudo. | Regla 2; «Cifra principal 32 a 36» | alta |
| `recep-pagos-pago-registrado`, `recep-pagos-pago-ya-estaba-registrado` | escritorio y celular | En la confirmación, el monto registrado ($400.00) va en 14 px, mismo tamaño que el texto del aviso, y debajo del aviso el saldo ($2,950.00) a 36 px domina la pantalla. La persona vino a confirmar el pago recién hecho. | Regla 2 | media |
| `recep-pagos-monto-cero`, `-monto-decimales`, `-monto-letras`, `-monto-mayor-al-saldo`, `-monto-parcial`, `-monto-varios-cargos`, `-propuesta-error`, `-propuesta-cargando`, `-error-del-servidor`, `-sin-red` | escritorio y celular | Con el campo de monto enfocado se dibuja un segundo anillo morado alrededor del texto, dentro de la caja de 2 px. Con error, el borde rojo de 2 px queda cruzado por el anillo morado y la caja ya no se lee como «error». Causa: en `base.css`, la regla de la línea 277 (`input:not(...):not(...):focus-visible`, especificidad 0,3,1) gana a `.monto-caja input:focus-visible { outline: none }` de la línea 646 (0,2,1), así que el `outline: none` nunca se aplica. | Campos: «Con error: borde de 2 px --peligro»; foco: un anillo de 2 px con 2 de separación | media |
| `recep-pagos-buscador-una-letra`, `recep-ventas-alumno-una-letra` | escritorio y celular | Mismo anillo doble en el buscador con ícono de lupa: un anillo por la caja y otro por el input, desfasados. El mensaje «Escribe al menos dos letras para buscar» queda en gris suave, sin el estilo de error. | Foco; Campos: «Con error…» | media |
| `recep-corte-con-devoluciones` | escritorio | Dentro de «Todo el día» hay tres totales de 36 px apilados («Total», devolución y «Neto del día») con el mismo peso y casi sin separación (8 px entre el último subtotal y el siguiente encabezado). El «Neto del día», el dato que se cuadra contra la caja, no destaca sobre los otros dos. | Regla 2; espacios 16/20 entre bloques | media |
| `recep-uniformes-vacio`, `recep-uniformes-error`, `recep-ventas-vacio` | escritorio y celular | El panel «Existencia» queda como un recuadro blanco con solo su título, sin ícono, frase ni siguiente paso. En `uniformes-vacio` el estado vacío de arriba sí lo tiene y el de abajo no. | Estado vacío: «recuadro con ícono, una frase y el siguiente paso» | media |
| `recep-corte-dia-sin-cobros`, `recep-corte-hoy-sin-cobros` | escritorio y celular | El día sin cobros se muestra como aviso informativo morado con borde grueso a la izquierda, no como estado vacío (sin ícono propio de vacío, sin siguiente paso). Distinto de «No encontré a esa familia» y «Todavía no hay pagos», que sí usan el patrón de estado vacío. | Estado vacío; consistencia dentro del área | baja |
| `recep-pagos-pago-cancelado`, `recep-pagos-familia-con-pagos-recientes`, `recep-pagos-pago-registrado`, `recep-ventas-venta-anulada`, `recep-ventas-venta-registrada` | escritorio y celular | «Cancelar pago» y «Anular» son texto rojo sin borde ni fondo, repetidos en cada fila. Ni son botón destructivo (borde y texto `--peligro`) ni botón de solo ícono de 44 × 44 con nombre accesible. | Botones: destructivo; Tarjeta de lista: «acciones repetidas… botones de solo ícono» | baja |
| `recep-ventas-alumno-encontrado`, `recep-uniformes-entregar-dialogo`, `recep-pagos-buscador-una-letra` | escritorio y celular | Las listas desplegables (Alumno, Producto, «Pieza que se entrega») conservan la flecha nativa del navegador, pegada al borde derecho, distinta del resto de los campos. El «×» de borrar en los buscadores también es el nativo, pequeño y azul grisáceo, de menos de 44 px. | Campos (alto 44); solo ícono de 44 × 44 | baja |
| `recep-pagos-familia-con-adeudo`, `recep-pagos-metodo-tarjeta`, `recep-pagos-metodo-transferencia` | escritorio y celular | El botón de cierre dice «Registrar pago» a secas. La referencia dice «Registrar pago de $820.50»: el monto en el botón confirma lo que se va a cobrar sin mirar arriba. | `Recepcion.dc.html`, botón de 52–56 px con monto | baja |
| `recep-cuenta-familia-con-vencidos`, `recep-cuenta-familia-con-pagos`, `recep-corte-hoy` | celular | Antes de la cifra que la persona vino a ver hay tres botones secundarios de ancho completo (estado de cuenta: «Buscar otra familia», «Imprimir», «Descargar»; cierre: «Imprimir el cierre» más cuatro líneas de instrucciones). El saldo arranca hacia el píxel 455 y la cifra de «Tu caja» hacia el 630, casi al borde de la primera pantalla. | Regla 2 | baja |
| `recep-pagos-familia-al-corriente`, `recep-pagos-familia-sin-cargos` | escritorio y celular | Tres mensajes para lo mismo: la etiqueta «Nada vencido», el aviso verde «Esta familia no debe nada» y el panel «No hay nada que cobrar». | Regla 2 (ruido sobre el dato) | baja |
| `recep-uniformes-lista`, `recep-uniformes-muchos-datos` | escritorio y celular | Cada tarjeta de entrega lleva un botón sutil con texto («Marcar entregado») en vez de ícono. La lista «Existencia» no usa las etiquetas «Última pieza» / «Agotado» que sí tiene la de Ventas, aunque muestra los mismos datos. En escritorio, una sola tarjeta de 350 px queda sobre un panel de ancho completo. | Tarjeta de lista; consistencia entre pantallas | baja |
| `recep-corte-cargando`, `recep-cuenta-familia-cargando`, `recep-pagos-familia-cargando`, `recep-uniformes-cargando`, `recep-ventas-cargando` | escritorio y celular | La carga muestra solo «Cargando…» con ruedita, sin el título de la pantalla; al llegar los datos, el título aparece y todo se corre. | Consistencia con las pantallas que sí muestran título | baja |

Notas que no cuentan como hallazgo: el campo de fecha muestra `mm/dd/yyyy` y el «10» seleccionado por la configuración regional del navegador de las capturas; los tonos del monto, el selector segmentado, la etiqueta «Pago parcial» y el botón deshabilitado coinciden con SISTEMA-VISUAL; en las vistas de impresión, el borde derecho de paneles y tabla toca el borde de la captura porque el arnés imprime sin márgenes de página.

## Escenas revisadas sin hallazgos

- `recep-corte-con-cobros-y-cancelados`
- `recep-corte-error`
- `recep-corte-hoy-administrador`
- `recep-corte-impresion`
- `recep-corte-muchos-movimientos`
- `recep-cuenta-buscador`
- `recep-cuenta-buscador-asesor`
- `recep-cuenta-buscador-resultados`
- `recep-cuenta-buscador-sin-resultados`
- `recep-cuenta-familia-al-corriente`
- `recep-cuenta-familia-error`
- `recep-cuenta-familia-impresion`
- `recep-cuenta-familia-muchos-movimientos`
- `recep-cuenta-familia-sin-cargos`
- `recep-cuenta-familia-solo-lectura-asesor`
- `recep-cuenta-familia-tras-varios-pagos`
- `recep-pagos-buscador-buscando`
- `recep-pagos-buscador-busqueda-incompleta`
- `recep-pagos-buscador-error`
- `recep-pagos-buscador-inicial`
- `recep-pagos-buscador-muchos-resultados`
- `recep-pagos-buscador-resultados-nombre`
- `recep-pagos-buscador-resultados-telefono`
- `recep-pagos-buscador-sin-red`
- `recep-pagos-buscador-sin-resultados`
- `recep-pagos-buscador-telefono-incompleto`
- `recep-pagos-cancelar-dialogo`
- `recep-pagos-cancelar-dialogo-error`
- `recep-pagos-cancelar-dialogo-motivo`
- `recep-pagos-familia-error`
- `recep-pagos-familia-muchos-datos`
- `recep-pagos-fecha-futura`
- `recep-pagos-pagos-recientes-error`
- `recep-pagos-reparto-a-mano`
- `recep-pagos-reparto-a-mano-errores`
- `recep-pagos-reparto-a-mano-faltan`
- `recep-pagos-reparto-a-mano-sobran`
- `recep-uniformes-entregar-error`
- `recep-uniformes-entregar-inventario-error`
- `recep-uniformes-entregar-sin-existencia`
- `recep-uniformes-entregar-sin-red`
- `recep-uniformes-entregar-ya-entregado`
- `recep-ventas-alumno-error`
- `recep-ventas-alumno-sin-resultados`
- `recep-ventas-anular-dialogo`
- `recep-ventas-anular-dialogo-error`
- `recep-ventas-anular-dialogo-motivo`
- `recep-ventas-cantidad-cero`
- `recep-ventas-cantidad-mayor-a-la-existencia`
- `recep-ventas-error`
- `recep-ventas-error-del-servidor`
- `recep-ventas-inicial`
- `recep-ventas-muchos-datos`
- `recep-ventas-sin-red`
- `recep-ventas-todo-agotado`
