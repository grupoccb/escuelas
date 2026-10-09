# PLAN-V1.md — Versión 1 para la escuela

9 de octubre de 2026.

El sistema completo ya existe contra simuladores en la rama `noche-2` (`docs/PLAN-NOCHE-2.md`, `docs/BITACORA-NOCHE-2.md`). Esta sesión no agrega fases: convierte lo construido en algo que la escuela pueda usar el primer día y que Eduardo pueda probar desde su celular.

Objetivo, en dos frases:
- Lo que la escuela va a ver funciona de punta a punta y se entiende sin que nadie se lo explique.
- En cuanto Eduardo ponga credenciales de Twilio, manda un WhatsApp desde su celular y ve todo el recorrido real en menos de 15 minutos.

Eduardo no va a estar contestando. No te detengas a preguntar. Después de cualquier compactación de contexto, vuelve a leer este archivo y `docs/BITACORA-V1.md`.

## Reglas

Aplican todas las reglas de `docs/PLAN-NOCHE.md` y `docs/PLAN-NOCHE-2.md`, incluidas las ocho que Eduardo agregó para las etapas F a K, y la misma autorización: se construye sin esperar gates y no se marca ninguno. Además:

- Rama `v1-escuela`, creada desde `noche-2`. No se toca `noche-2`, `noche-fase1` ni `main`.
- Bitácora en `docs/BITACORA-V1.md`, con el mismo formato y estados honestos: `HECHO` o `HECHO (parcial: lo que falta)`.
- Un commit por bloque. Nunca varios bloques en un commit.
- **Remoto.** `origin` es `https://github.com/grupoccb/escuelas.git`. Al cerrar cada bloque, `git push origin v1-escuela`. Nunca `--force`, nunca borrar ramas o etiquetas remotas, nunca empujar a `main`.
- Todo lo que toca pantalla se prueba en un navegador real y deja capturas.
- Sin credenciales reales y sin tráfico a Twilio, Meta ni AWS. El ensayo real lo corre Eduardo, no tú.
- Los textos que ve la escuela van en español de México, sin términos técnicos, sin inglés y sin identificadores a la vista.

## Decisiones de Eduardo

No las vuelvas a preguntar.

1. **La escuela arranca con captación:** bot de tres preguntas, pase al asesor, tareas, embudo y reporte de leads. Lo demás se enciende por módulos cuando esté listo.
2. **Módulos por organización:** captación, cotizador, clase muestra, inscripción, operación (asistencia, niveles y eventos), finanzas y tableros. Un módulo apagado no aparece en la interfaz, sus rutas no responden, sus automatizaciones no corren y el bot no lo ofrece.
3. **Valores por defecto:** en la organización de demo, todo encendido. En la plantilla de una organización nueva, solo captación.
4. **Reprogramar o cancelar una clase muestra por una persona** sí avisa a la familia, como aviso de servicio.
5. **Un lead sin sucursal** lo ven todos los asesores de la organización hasta que tenga sucursal.
6. **Una promoción no acumulable no se combina con ninguna otra.**
7. **En desarrollo local** la aplicación acepta `localhost` y `127.0.0.1`. En producción, solo `ORIGEN_PUBLICO`.

## Bloques, en orden

**V0. Preparación.**
- Agrega el remoto `origin` si no existe y sube lo que ya hay: `git push -u origin main noche-fase1 noche-2` y `git push origin --tags`. Si el remoto ya trae commits que no están aquí, no fuerces nada: anótalo como BLOQUEADO para Eduardo y sigue trabajando en local.
- Rama `v1-escuela`, bitácora con la tabla de bloques, línea base de `validar`, `test:int` y `test:navegador`.

**V1. Módulos por organización** (decisiones 1 a 3). Interruptores en administración. Por cada módulo, pruebas de que apagado no se ve en la interfaz, no responde por API, no dispara automatizaciones y no lo menciona el bot; y de que encenderlo no requiere tocar código ni reiniciar.

**V2. Decisiones 4 a 7,** cada una con sus pruebas.

**V3. Segundo hijo.** Agregar más niños a un lead desde la ficha del asesor y por API. La conversión inscribe a los hermanos en una sola operación y la promoción por hermanos se aplica sola. `demo:guiada` lo muestra.

**V4. Cierre con el maestro en sitio** probado en navegador (hallazgo EK-15).

**V5. Configuración sin SQL.** Haz el inventario de todo lo que hoy solo se puede cambiar por SQL (tiempos, límites, políticas, textos). Lo que la escuela o Grupo CCB cambiarían en la operación normal pasa a administración. Lo demás queda documentado con su comando.

**V6. Carga del catálogo real.**
- Plantillas en CSV que la escuela pueda llenar en Excel: sucursales, salones, instructores, programas, grupos, horarios, cupos y precios.
- Importador con modo de simulación: valida todo y reporta los errores por fila, en español claro, sin escribir nada. Aplicado de verdad, es idempotente.
- Corre las verificaciones del catálogo (traslapes de edad, choques de salón) antes de aceptar.
- `docs/QUE-PEDIRLE-A-LA-ESCUELA.md`: qué dato se necesita, para qué sirve y qué pasa si falta, listo para mandarse.

**V7. Recorrido por rol.** Un subagente nuevo por cada rol, en navegador real, haciendo el trabajo de un día normal:
- **Asesor,** en escritorio: llega un lead, lo atiende, agenda, da seguimiento, cierra tareas.
- **Maestro,** en celular de 390 px: ve sus clases del día, registra al niño, pasa lista.
- **Recepción:** cobra, consulta un estado de cuenta, entrega un uniforme, vende un producto.
- **Administrador:** da de alta un grupo, cambia un precio, enciende un módulo, revisa un tablero.

Cada subagente anota toda fricción: texto confuso o técnico, error que no dice qué hacer, pantalla vacía sin siguiente paso, callejón sin salida, tarea diaria que toma más de tres pasos, algo ilegible en celular. Corrige lo encontrado. Capturas de antes y después en `docs/capturas/v1/`.

**V8. Guías de una página por rol,** con capturas, pensadas para alguien que nunca vio el sistema: `docs/guias/asesor.md`, `maestro.md`, `recepcion.md` y `administrador.md`. La del asesor incluye cómo se trabaja en Chatwoot.

**V9. Ensayo con WhatsApp real, preparado.** Usa el sandbox de WhatsApp de Twilio.
- Perfil `ensayo` de compose, sin el bloqueo de dominios de Twilio.
- Un comando que configura la bandeja de Twilio en Chatwoot a partir de variables de entorno.
- Las rutas del borde con validación de firma contra la URL pública.
- Túnel hacia la Mac con una herramienta que no pida cuenta, documentado.
- `docs/ENSAYO-WHATSAPP-REAL.md`: los pasos de Eduardo, en menos de 15 minutos, y la lista de lo que debe comprobar: llega el mensaje, contesta el bot, aparece la nota en Chatwoot, la respuesta del asesor llega al celular, se guardan los estados de entrega, `+521` y `+52` dan un solo lead, y la palabra BAJA funciona. También cómo regresar al modo simulado.
- Todo probado contra un Twilio falso local. Tú no usas credenciales reales.

**V10. Hallazgos abiertos.** Recorre los pendientes de todas las auditorías, de `fase-1.md` a `etapa-K9-final.md`. Corrige los que no dependan de una decisión de producto ni de credenciales reales, y haz que un agente distinto verifique las correcciones.

**V11. Decisiones para Eduardo.** `docs/DECISIONES-PARA-EDUARDO.md`: una sola lista, sin duplicados y al día, en tres grupos: bloquea salir con captación, bloquea un módulo posterior, puede esperar. Cada decisión con sus opciones, tu recomendación y qué pasa si no se decide. Actualiza `docs/SUPUESTOS-Y-DECISIONES.md`.

**V12. Demo de un solo comando.** `npm run demo:todo` reconstruye la demo local desde cero y deja `http://localhost:3000` con datos y los cuatro usuarios. `demo:guiada` actualizada con módulos y hermanos.

**V13. Auditoría final.** Un subagente nuevo intenta refutar todo lo de esta sesión desde una copia limpia, con énfasis en que un módulo apagado no deje nada a la vista ni corriendo. Correcciones verificadas por un agente distinto. Resumen de diez líneas al inicio de la bitácora y las cinco cosas que Eduardo debe ver primero.
