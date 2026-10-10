# V7 — Administrador: el guion del día

Adela, administradora de la escuela, en la computadora de la oficina (1366×768), con la revisión de tableta (768×1024) y celular (390) de las pantallas que más usa. Nunca vio el
sistema. Cada paso deja una captura `antes-NN-…` (antes de corregir) y `despues-NN-…` (mismos pasos, ya corregido) en esta carpeta. Lo hace `web/e2e/v7-administrador.spec.ts`.

## El primer día de una escuela nueva

1. **Entra a una escuela vacía** (sin disciplinas, sucursales, programas ni grupos; solo la captación encendida). ¿Qué ve en Administración? ¿Sabe qué sigue? ¿Hay un camino de uno en uno?
2. **Da de alta una disciplina, una sucursal, un programa, un precio y un grupo nuevos solo desde Administración** (la «prueba de fuego»): ¿aparece la página pública de la disciplina?
   ¿cada paso avisa que ya quedó guardado?

## Un día normal

3. **Alta de un grupo** (programa existente, salón, instructor, cupo, horarios): lo que pasa con un choque de salón, un choque de instructor y un traslape de edad entre programas, y lo que
   dice la pantalla con el formulario vacío.
4. **Cambia un precio** (versión nueva con fecha): ¿qué pasa con las inscripciones ya hechas? ¿y si la fecha ya está ocupada?
5. **Crea y edita una promoción** (una acumulable y otra que no): formulario vacío, código repetido, beneficios.
6. **Enciende y apaga un módulo** (dependencias en palabras claras; qué cambia para cada rol; que recepción pierda sus pantallas y las recupere).
7. **Carga el catálogo desde Excel** con un archivo que no es CSV.
8. **Cambia la configuración** (horario de los mensajes automáticos, modo de cierre).
9. **Crea un usuario de cada rol**, entra como cada uno (lo que ve cada rol), restablece una contraseña, desactiva a alguien, una persona que se equivoca de contraseña y el cambio de la propia
   contraseña.
10. **Revisa los tableros**: clases muestra, costo por campaña con gasto capturado (y sin gasto), ejecutivo; descarga un CSV.
11. **La bandeja de eventos inesperados y las tareas sin lead.**
12. **Edita una plantilla de mensaje y una automatización** (clase servicio o marketing).
13. **Da de baja un grupo** (confirmación, alternativa reversible, un grupo con inscritos).
14. **Campañas y códigos QR**: dar de alta una campaña y bajar su QR.

## Otros días

15. **Lectura de las 20 pantallas**: ¿hay términos técnicos, identificadores o inglés a la vista?
16. **Tableta (768×1024) y celular (390):** las pantallas más usadas caben, sin desborde, con botones de 44 px.
17. **Lo que no ve cada rol:** asesor, maestro y recepción no entran a Administración (pantalla y API).
