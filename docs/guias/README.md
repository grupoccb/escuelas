# Guías de una página por rol

Cada guía cabe en una hoja carta, está escrita para alguien que nunca vio el sistema y trae capturas reales y actuales.

| Guía | Para quién | Páginas |
|---|---|---|
| [asesor.md](asesor.md) | Asesor: Embudo, ficha, tareas y cómo se trabaja en Chatwoot | 1 |
| [maestro.md](maestro.md) | Maestro: Hoy, registro del alumno, pase de lista y qué pasa sin señal (pensada para el celular: también en [PDF para celular](pdf/maestro-celular.pdf)) | 1 |
| [recepcion.md](recepcion.md) | Recepción: cobrar, repartir entre hermanos, cancelar, estado de cuenta, uniformes, ventas y cierre del día | 1 |
| [administrador.md](administrador.md) | Administrador: «Para empezar», módulos, catálogo desde Excel, usuarios, configuración y tableros | 1 |

Para imprimirlas o mandarlas, usa los PDF de [pdf/](pdf/) (hoja carta).

Para el detalle de cada tarea del asesor y de cada rol: [../OPERACION.md](../OPERACION.md).

## Cómo escribir o cambiar una guía

- Lo que va entre comillas de ángulo, como «Embudo», es el nombre exacto de un botón, pantalla o campo de la aplicación. Una prueba lo busca en la interfaz: si cambias un nombre en la aplicación y la guía no se actualiza, `npm run guias:validar` falla.
- Un mensaje real de la pantalla va entre “comillas curvas”; los puntos suspensivos (…) tapan la parte que cambia (un nombre, un número).
- Las **negritas** solo se usan para nombres de Chatwoot (la bandeja de WhatsApp, que no es nuestra). La prueba las compara con `chatwoot-textos.json`, que se llena solo cuando las capturas de Chatwoot se toman contra un Chatwoot arriba.
- Nada de términos técnicos, inglés ni identificadores en el texto de la guía.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run guias:capturas` | Regenera las imágenes de `img/` (un recorrido en navegador por cada guía) y los PDF de `pdf/`, y falla si una guía ya no cabe en su número de páginas. Crea su propia base de pruebas; nunca toca la demo. Si el Chatwoot local está arriba (`docker compose up -d --wait`) y tiene una conversación abierta sin asignar y otra que el asistente todavía atiende (`npm run demo:contacto -- --bandeja <nombre> --respuestas "Hola\|Mateo\|9\|1\|asesor"` y `--respuestas "Hola"`), también captura Chatwoot; si no, deja las imágenes que ya estaban. |
| `npm run guias:validar` | Solo la prueba de que cada botón, pantalla y mensaje citado existe en la interfaz, que las imágenes y los enlaces existen y que el texto no tiene jerga. No necesita navegador; también corre dentro de `npm run validar`. |

Pendiente de captura (necesita WhatsApp real): cómo se ve en Chatwoot el aviso de las 24 horas y el selector de plantillas de un canal de Twilio. Hoy la guía lo describe en texto.
