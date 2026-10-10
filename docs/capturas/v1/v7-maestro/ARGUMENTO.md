# V7 — Recorrido del maestro (celular 390×844, con tacto)

Persona: Mario, maestro del Grupo A de la sucursal Norte, que nunca vio el sistema. Un día normal, en el orden en que ocurriría, en su teléfono. Meta: cada tarea diaria en 3 pasos o menos (un paso = un toque o una elección; escribir en un campo no cuenta).

Datos: el mundo sembrado de las pruebas en navegador (base propia `v7_maestro_inscripciones_navegador_pruebas`, puerto 4373, sin credenciales). El spec crea sus propios datos para no depender de lo que dejen las demás pruebas: un grupo propio con horario, la clase muestra de «Valeria» (agendada, registro vacío) y la de «Camila» (asistió, registro casi completo). El pase de lista usa a los alumnos de «Grupo A» en una fecha que nadie más toma. Entrar y salir se hacen con un inicio de sesión PROPIO (salir revoca la sesión en el servidor y no debe tirar la que comparten las demás pruebas).

## El guion

1. **Abre la aplicación y entra.** Pantalla de acceso, correo y contraseña, «Entrar»; llega a «Hoy».
2. **«Hoy».** Sus clases del día con hora, niño y grupo. Sin teléfonos de la familia ni importes.
3. **Marca «Asistió»** (y se equivoca con «No asistió» y lo corrige). Con y sin señal.
4. **Registro del niño nuevo** (clase muestra): datos del niño, adultos, salud (que no debe quedar en pantalla ni en capturas después de guardar), antecedentes, observación, reglamento e imagen; «Marcar registro como completo».
5. **Lo escrito a medias:** cambia de pantalla, usa «Volver», el atrás del teléfono; se le va la sesión; se queda sin señal.
6. **«Listo para cerrar»** (escuela donde cierra el asesor) o **cierre en sitio** (inscribe él, con confirmación).
7. **Pase de lista de su grupo:** todos presentes, una falta, guardar; corrige una falta equivocada; sin señal; red lenta con doble toque.
8. **Consulta el expediente** de un alumno suyo (sin importes) y **de uno que no es suyo** (debe negarse con un mensaje claro).
9. **Revisión del celular:** objetivos táctiles ≥ 44 px, teclado que tapa el botón de guardar, desbordes horizontales, texto cortado, zoom automático (letra de 16 px), orientación horizontal.
10. **Cierra sesión y vuelve a entrar.**

Cada paso deja captura `antes-NN-…` (antes de corregir) y `despues-NN-…` (mismos pasos, ya corregido). Las fricciones y su tratamiento están en `docs/BITACORA-V1.md` → «V7 — maestro».
