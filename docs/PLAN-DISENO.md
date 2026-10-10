# PLAN-DISENO.md — Rediseño de toda la interfaz

10 de octubre de 2026. Va en `docs/PLAN-DISENO.md`.

Eduardo aprobó un diseño nuevo. Está especificado en `docs/diseno/SISTEMA-VISUAL.md` y en las cinco pantallas de `docs/diseno/referencia/`. Esta sesión lo lleva a **toda** la interfaz.

"Toda" es literal: cada pantalla, cada estado de cada pantalla y todo lo que aparece encima de una pantalla. Fijas, dinámicas y flotantes. El trabajo no termina cuando las pantallas principales se ven bien, sino cuando no queda una sola fila del inventario sin su captura nueva.

Eduardo no va a estar contestando. No te detengas a preguntar. Después de cualquier compactación de contexto, vuelve a leer este archivo, `docs/diseno/SISTEMA-VISUAL.md` y `docs/BITACORA-DISENO.md`.

## Reglas

Aplican todas las reglas de `docs/PLAN-NOCHE.md`, `docs/PLAN-NOCHE-2.md` y `docs/PLAN-V1.md`. Además:

**Rama y remoto**
- Rama `diseno-v1`, creada desde `v1-escuela`. No se toca ninguna otra.
- Un commit por bloque y `git push origin diseno-v1` al cerrarlo. Nunca `--force`.
- Bitácora en `docs/BITACORA-DISENO.md`, con estados honestos.

**Qué se puede cambiar y qué no**
- Se cambia el aspecto, la jerarquía y la disposición de los elementos.
- No se cambia el comportamiento, la API, los permisos ni los flujos.
- Los textos no cambian, salvo donde la referencia muestra uno distinto.
- Los nombres accesibles que usan las pruebas se conservan. Si la referencia convierte un botón de texto en uno de solo ícono, conserva el mismo nombre accesible.
- Ninguna prueba se debilita ni se salta para que pase.

**Cómo se estila**
- Todo sale de las variables de `web/src/estilos/base.css`. Ningún color, fuente o medida escrito directo en un componente.
- Sin estilos en línea en los componentes.
- Las fuentes se sirven desde el propio origen. No se relaja la política de seguridad de contenido para dominios externos.
- Un solo tema, claro.

**Cómo se comprueba**
- Cada fila del inventario se cierra con su captura de después, en escritorio de 1366 px y en celular de 390 px.
- Al cerrar cada bloque de pantallas, un subagente con contexto nuevo mira las capturas una por una contra `SISTEMA-VISUAL.md` y anota lo que no cumple. Se corrige antes de seguir.
- `npm run validar`, `npm run test:int` y `npm run test:navegador` en verde al cerrar cada bloque.

**Dependencias.** Solo las necesarias para servir las dos fuentes desde el propio origen y para revisar accesibilidad en el navegador. Cada una anotada con su motivo.

## Bloques, en orden

**D0. Preparación.** Rama, bitácora con la tabla de bloques y línea base de las tres validaciones.

**D1. Inventario total.** `docs/diseno/INVENTARIO.md`, una fila por cada cosa que una persona puede llegar a ver:
- Cada ruta de la aplicación, por cada rol que la puede abrir.
- Cada estado de cada pantalla: cargando, vacía, con datos, con muchos datos, con error, sin permiso, con el módulo apagado, sin conexión donde aplique.
- Cada paso de cada asistente y cada formulario con sus errores de validación.
- Todo lo flotante: cada diálogo, cada confirmación, cada aviso, la barra de guardado, menús y listas desplegables, el aviso de sesión vencida.
- Las vistas de impresión.
- Lo que vive fuera de React: la página pública de registro con todos sus estados y cualquier otra página que el servidor arme.
- El ícono de la pestaña y el título.

El inventario se comprueba solo: un comando `npm run diseno:inventario` lo coteja contra las rutas reales del enrutador, contra cada uso de los componentes de diálogo, confirmación y aviso, y contra las clases de `base.css`, y falla si existe algo que no está en la lista. Cada fila lleva su captura de antes.

**D2. Cimientos.**
- Variables de `base.css` con los valores de `SISTEMA-VISUAL.md`, conservando los nombres existentes y agregando las nuevas.
- Fuentes servidas desde el propio origen.
- Tema único claro.
- Guarda `npm run check:estilo`, dentro de `validar`: falla si aparece un color, una fuente o un estilo en línea fuera de las variables.

**D3. Estructura general.** Barra lateral con marca, íconos y usuario; cabecera de pantalla; barra inferior en celular; foco visible en todo.

**D4. Componentes base** de `web/src/ui`: botones con sus variantes y su estado de cargando, campos de todo tipo con ayuda y error, selector segmentado, etiquetas, tarjetas, paneles, indicadores, tablas con su versión de celular, pestañas, listas, estados vacíos, cargando y paginación.

**D5. Todo lo flotante.** Diálogos, confirmaciones, avisos, barra de guardado, menús, listas desplegables y el aviso de sesión vencida.

**D6. Acceso y cuenta.** Inicio de sesión con sus errores, "no puedo entrar", sesión vencida, contraseña, página no disponible y módulo apagado.

**D7. Asesor.** Hoy, embudo en tablero y en lista, ficha del lead, tareas, cotizar, agendar, reprogramar, cancelar, mover de etapa, perder y recuperar.

**D8. Conversión e inscripción.** Todos los pasos del asistente, con hermanos y con rechazos.

**D9. Maestro, en celular.** Hoy, registro del alumno completo, pase de lista, alumnos, expediente, cierre en sitio y los estados sin señal.

**D10. Recepción.** Buscar familia, registrar pago, estado de cuenta, uniformes, ventas y cierre del día, con sus vistas de impresión.

**D11. Familias, alumnos y expediente.**

**D12. Tableros.** Gráficas con la paleta del sistema, legibles sin depender del color.

**D13. Administración.** Catálogo completo, precios, promociones, módulos, usuarios, configuración, textos, etapas, motivos, carga del catálogo, plantillas y automatizaciones.

**D14. Fuera de React.** La página pública de registro con todos sus estados, el ícono de la pestaña y el título.

**D15. Movimiento y estados.** Las transiciones de `SISTEMA-VISUAL.md` y los estados de hover, activo, foco y deshabilitado en cada elemento interactivo. Respeta `prefers-reduced-motion`.

**D16. Accesibilidad y tamaños.** Revisión automática de contraste y nombres accesibles sobre todas las filas del inventario; recorrido solo con teclado; 390 px sin desbordes; 1366 y 1920 px; texto al 200 %.

**D17. Guías, demo y galería.**
- Regenera las imágenes y los PDF de `docs/guias/` y las capturas de la demo.
- `docs/diseno/galeria.html`: una sola página con el antes y el después de cada fila del inventario, agrupada por rol, para que Eduardo la recorra en su pantalla y en su celular.

**D18. Auditoría final.** Un subagente nuevo recorre el inventario completo, fila por fila, mirando cada captura de después contra `SISTEMA-VISUAL.md`. Es hallazgo toda fila sin captura, toda pantalla que conserve el aspecto anterior y todo color, fuente o medida fuera del sistema. Las correcciones las verifica un agente distinto. Cierra con un resumen de diez líneas y las cinco cosas que Eduardo debe ver primero.
