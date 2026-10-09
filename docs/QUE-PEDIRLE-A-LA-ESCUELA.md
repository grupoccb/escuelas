# Lo que necesitamos de su escuela para empezar

Hola. Para dejar el sistema listo con los datos reales de su escuela necesitamos reunir cierta información. La mayor parte se captura en unas hojas de Excel que le mandamos (las plantillas) y que usted puede llenar con calma; el resto son unos cuantos datos sueltos.

Para cada dato le explicamos **para qué sirve** y **qué pasa si falta**, para que sepa qué es urgente y qué puede esperar. Nada de lo que nos mande se guarda hasta que lo revisemos juntos: el sistema primero lo revisa y le dice, fila por fila, si algo está mal escrito.

## Cómo está organizado

El sistema se enciende por etapas. Usted decide cuándo pasar de una a otra:

1. **Necesario para empezar con captación**: que las familias que escriben o llenan el formulario sean atendidas y no se pierda ninguna.
2. **Necesario para encender el cotizador**: que el sistema sepa decir a cada familia qué grupo le corresponde, a qué hora, cuánto cuesta y si hay lugar.
3. **Necesario para encender la clase muestra**: que se agende la clase de prueba y se avise al maestro.
4. **Necesario para encender la inscripción**: que se inscriba al alumno y se le generen sus cobros.
5. **Para después**: asistencia, finanzas y tableros.

Puede empezar solo con la etapa 1 y mandarnos lo demás cuando lo tenga.

## Cómo llenar las plantillas

Le mandamos una carpeta con ocho archivos de Excel (también están en un solo paquete comprimido) y una hoja de instrucciones (`LEEME.txt`):

| Archivo | Qué lleva |
|---|---|
| `disciplinas.csv` | Lo que enseña la escuela (cada disciplina o actividad) |
| `sucursales.csv` | Cada sucursal: nombre, dirección y zona horaria |
| `salones.csv` | Los salones de cada sucursal y cuántas personas caben |
| `instructores.csv` | Quienes dan clase, con su teléfono |
| `programas.csv` | Cada oferta por rango de edad (por ejemplo «Infantil, de 6 a 9 años») |
| `grupos.csv` | Cada grupo: cupo, salón e instructor |
| `horarios.csv` | Los días y las horas de cada grupo |
| `precios.csv` | Inscripción y mensualidad de cada programa |

Algunas reglas sencillas:

- Llene solo los archivos que necesite. No hace falta mandar todos a la vez.
- No cambie la primera fila (los encabezados). La segunda fila es un ejemplo inventado: puede borrarla o dejarla.
- Los nombres se escriben **igual en todos los archivos** (por ejemplo, la sucursal de un salón). No importan las mayúsculas ni los acentos.
- Guarde cada archivo como **«CSV UTF-8 (delimitado por comas)»**. Si su Excel solo ofrece «CSV (delimitado por comas)», también sirve.
- Fechas como día/mes/año (15/09/2026), horas en formato de 24 horas (17:00) y los días con su nombre (lunes, martes…).
- El dinero se escribe como 500 o 500.50, sin signo de pesos.
- Si algo ya estaba cargado y nos manda el archivo otra vez, no se duplica nada. Y **el sistema nunca borra** lo que ya tenga: si quiere quitar algo, lo hacemos aparte.

**A quién mandarlas:** a la persona de Grupo CCB que lleva su implementación (o a la dirección de correo que le indicó su ejecutivo de cuenta). Le respondemos con el resultado de la revisión, fila por fila, en menos de un día hábil.

---

## 1. Necesario para empezar con captación

| Dato | Para qué sirve | Qué pasa si falta |
|---|---|---|
| **Nombre de la escuela** y cómo quiere que aparezca ante las familias | Es el nombre que verán las familias en el formulario de registro y en los mensajes | No podemos preparar su cuenta |
| **Disciplinas** (`disciplinas.csv`): nombre de cada una y, si quiere, el color de su marca | Cada disciplina tiene su propio formulario de registro, su propio número de WhatsApp (si lo desea) y sus propios reportes | Sin ella el sistema no sabe de qué actividad pregunta una familia |
| **Sucursales** (`sucursales.csv`): nombre, dirección y zona horaria | La dirección se le da a la familia; la zona horaria decide a qué hora salen los mensajes automáticos (nunca antes de las 9:00 ni después de las 20:00, hora de la sucursal) | Sin zona horaria no podemos asegurar que los mensajes salgan a buena hora. Sin dirección, el asesor tiene que dar la ubicación a mano |
| **Número de WhatsApp** de cada disciplina (o de la escuela) y quién lo tiene verificado ante Meta | Es el número por el que las familias le escriben y por el que el sistema contesta | Sin él no podemos conectar WhatsApp. Es el trámite que más tarda; conviene empezarlo desde el primer día |
| **Asesores**: nombre, correo y a qué sucursal atiende cada uno | Reciben a las familias que el asistente les pasa, y cada uno ve solo lo de su sucursal | Sin ellos nadie recibe los avisos ni las tareas de seguimiento |
| **Quién será administrador** (nombre y correo) | Es quien puede cambiar precios, horarios y ajustes | Sin administrador no se puede entrar a configurar |
| **Aviso de privacidad** revisado por su abogado | Se muestra a la familia antes de pedirle sus datos | Sin él el formulario de registro no abre: no se pueden recibir datos de las familias |

## 2. Necesario para encender el cotizador

Con esto el asistente de WhatsApp (y su asesor) pueden decir en segundos: «Para un niño de 7 años tenemos el grupo de martes y jueves a las 4 de la tarde, cuesta tanto y quedan 3 lugares».

| Dato | Para qué sirve | Qué pasa si falta |
|---|---|---|
| **Programas** (`programas.csv`): para cada disciplina y sucursal, qué grupos de edad hay: nombre, edad mínima y edad máxima | El sistema decide a qué programa mandar a un niño según su edad | Sin edades el sistema no sabe a qué grupo mandar a un niño y el asesor tiene que cotizar a mano, uno por uno |
| **Fecha de corte de edad** (si la escuela mide la edad a una fecha fija, por ejemplo el inicio del ciclo) | Un niño que cumple años después del corte entra en el programa que le toca ese ciclo | Sin ella se usa la edad que tenga el día de la consulta, y un niño puede cambiar de programa a mitad de ciclo |
| **Qué programas comparten edades** (cuando una familia puede elegir entre dos estilos para la misma edad) | El asistente le pregunta cuál prefiere en lugar de adivinar | Si se traslapan sin avisarnos, el sistema nos lo marca como error y no deja cargar |
| **Grupos** (`grupos.csv`): nombre, cupo, salón e instructor | El cupo permite decir «quedan N lugares» y avisar cuando un grupo se llena (con lista de espera si usted quiere) | Sin cupo no se puede ofrecer un lugar. Sin salón o instructor se puede arrancar, pero no se detectan choques de horario |
| **Salones** (`salones.csv`): nombre de cada uno y cuántas personas caben | Evita poner dos grupos en el mismo salón a la misma hora, y que el cupo de un grupo sea mayor que lo que cabe | Sin esto no se revisan choques de salón |
| **Horarios** (`horarios.csv`): día, hora de inicio y hora de fin de cada grupo | Es lo que se le ofrece a la familia y lo que usa el sistema para recordar la clase | Sin horario el grupo existe pero no se puede ofrecer: la familia no sabe cuándo es |
| **Precios** (`precios.csv`): inscripción y mensualidad de cada programa, y desde qué fecha rigen | El asistente cotiza y el sistema cobra con estos importes | **Sin precio no se cotiza ni se inscribe.** El asesor tendría que dar el precio de palabra |
| **Promociones** vigentes (descuento por hermanos, mes gratis, inscripción gratis…): condiciones, fechas y cupo | Se aplican solas en la cotización y al inscribir | Sin ellas se cotiza a precio de lista; las promociones se capturan después en Administración |

> Si mañana sube una mensualidad, no hace falta cambiar nada de lo anterior: manda una fila nueva con la fecha desde la que rige. **Lo que ya cobró a una familia no cambia.**

## 3. Necesario para encender la clase muestra

| Dato | Para qué sirve | Qué pasa si falta |
|---|---|---|
| **Instructores** (`instructores.csv`): nombre, **teléfono con WhatsApp** y en qué sucursales dan clase | Cuando se agenda, cambia o cancela una clase muestra, al maestro le llega un aviso por WhatsApp | Sin teléfono el maestro solo ve el aviso dentro de la aplicación; si no la abre, no se entera |
| **Quién da cada grupo** (la columna «Instructor» de `grupos.csv`) | Cada maestro ve solo las clases de sus grupos | Sin instructor nadie recibe el aviso de la clase muestra |
| **Reglamento y autorización de uso de imagen** (los textos) | Se le muestran a la familia y queda constancia de que los aceptó | Sin reglamento no se puede inscribir a nadie |
| **Los textos de los mensajes** (recordatorios, avisos) aprobados por WhatsApp | Es lo que el sistema manda fuera de la ventana de 24 horas | Sin mensajes aprobados el sistema no manda nada fuera de esa ventana y deja una tarea para que el asesor llame |

## 4. Necesario para encender la inscripción

| Dato | Para qué sirve | Qué pasa si falta |
|---|---|---|
| **Día de corte de pago** (cada cuánto se cobra la mensualidad) y cómo quiere tratar los atrasos | El sistema genera los cobros de cada mes y avisa a quien se atrasa | Sin él no se generan cobros automáticos |
| **Quién cierra la inscripción**: el asesor por WhatsApp, o el maestro en la propia clase | Define la pantalla que verá cada persona | Se asume que cierra el asesor |
| **Uniformes y artículos** que se venden (nombre, talla, precio, existencia) | Se entregan cuando una promoción los incluye y se descuentan del inventario | Sin ellos no se puede entregar un uniforme regalado ni venderlo en mostrador |
| **Recepcionistas**: nombre, correo y sucursal | Cobran y entregan uniformes | Sin ellos nadie registra pagos |

## 5. Para después (cuando la escuela ya esté operando)

| Dato | Para qué sirve | Qué pasa si falta |
|---|---|---|
| **Niveles o grados** de avance de los alumnos (por ejemplo, los colores o grados de cada disciplina) | El maestro registra qué nivel logra cada alumno | La escuela sigue funcionando; solo no se lleva el avance en el sistema |
| **Eventos** (exámenes, presentaciones, torneos): fecha, cuota y cupo | Se convoca a los alumnos y se cobra la cuota | Se pueden llevar fuera del sistema |
| **Motivos de baja y de pérdida** en palabras de la escuela | Los reportes dicen por qué se va una familia | Se usan los motivos de siempre, que se pueden cambiar después |
| **Gasto de cada campaña** de publicidad | El tablero calcula cuánto cuesta conseguir cada alumno | El tablero muestra cuántos llegaron, pero no cuánto costó cada uno |

## Lo que le vamos a devolver

Cada vez que nos mande archivos, le respondemos con:

- Un resumen: cuántas cosas se van a crear, cuáles se actualizan y cuáles ya estaban.
- Una lista de **errores por archivo, fila y columna**, en palabras sencillas (por ejemplo: «Fila 7, columna “Salón”: no existe el salón “Sala 3” en la sucursal “Centro”. Revise el nombre o agréguelo en el archivo de salones»).
- Algunos **avisos** que no impiden cargar (por ejemplo, «este programa quedaría sin precio»).

Hasta que todo esté en orden, **no se guarda nada**. Y cuando se cargue, si alguna vez nos manda el mismo archivo otra vez, el sistema dice «Sin cambios» y no duplica nada.

## Una pregunta para usted

¿Quiere que cada disciplina tenga su propio número de WhatsApp o que todas compartan el de la escuela? Cambia cómo se organiza la bandeja de sus asesores; podemos decidirlo juntos antes de conectar el número.
